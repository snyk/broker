package client

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sirupsen/logrus"
	"github.com/snyk/broker/pkg/filter"
	"github.com/snyk/broker/pkg/protocol"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "broker_client_http_requests_total",
			Help: "Total number of HTTP requests handled by the broker client.",
		},
		[]string{"type", "method", "status"},
	)
	wsConnectionStatus = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "broker_client_ws_connection_status",
			Help: "Status of the WebSocket connection to the broker server (1=connected, 0=disconnected).",
		},
	)
)

func init() {
	prometheus.MustRegister(httpRequestsTotal)
	prometheus.MustRegister(wsConnectionStatus)
}

type Config struct {
	ServerURL            string
	Token                string
	TargetURL            string
	Port                 int
	FilterPath           string // Path to filters.json
	ValidationURL        string // For systemcheck
	ValidationAuthHeader string // Authorization header for systemcheck
	CACertPath           string // Path to CA cert for server verification
	InsecureSkipVerify   bool   // Skip server certificate verification
}

type Client struct {
	config          Config
	conn            *websocket.Conn
	mu              sync.Mutex // Protects conn writes
	pendingRequests map[string]chan *protocol.ResponsePayload
	pendingMu       sync.Mutex
	server          *http.Server
	filters         *filter.Rules
	tlsConfig       *tls.Config
	log             *logrus.Logger
}

func NewClient(config Config) *Client {
	l := logrus.New()
	l.SetFormatter(&logrus.JSONFormatter{})
	return &Client{
		config:          config,
		pendingRequests: make(map[string]chan *protocol.ResponsePayload),
		log:             l,
	}
}

func (c *Client) Start(ctx context.Context) error {
	c.log.Info("Client starting...")

	c.tlsConfig = &tls.Config{
		InsecureSkipVerify: c.config.InsecureSkipVerify,
	}

	if c.config.CACertPath != "" {
		caCert, err := os.ReadFile(c.config.CACertPath)
		if err != nil {
			return fmt.Errorf("failed to read CA cert: %w", err)
		}
		caCertPool := x509.NewCertPool()
		caCertPool.AppendCertsFromPEM(caCert)
		c.tlsConfig.RootCAs = caCertPool
		c.log.Infof("Loaded CA cert from %s", c.config.CACertPath)
	}

	if c.config.FilterPath != "" {
		data, err := os.ReadFile(c.config.FilterPath)
		if err != nil {
			c.log.Warnf("failed to read filter file: %v", err)
		} else {
			rules, err := filter.LoadRules(data)
			if err != nil {
				return fmt.Errorf("failed to load filter rules: %w", err)
			}
			c.filters = rules
			c.log.Infof("Loaded filters from %s", c.config.FilterPath)
		}
	}

	if c.config.Port > 0 {
		mux := http.NewServeMux()
		mux.HandleFunc("/webhook/", c.handleWebhook)
		mux.HandleFunc("/systemcheck", c.handleSystemCheck)
		mux.HandleFunc("/healthcheck", c.handleHealthCheck)
		mux.Handle("/metrics", promhttp.Handler())
		
		c.server = &http.Server{
			Addr:    fmt.Sprintf(":%d", c.config.Port),
			Handler: mux,
		}
		go func() {
			c.log.Infof("Client HTTP server listening on :%d", c.config.Port)
			if err := c.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				c.log.Errorf("Client HTTP server error: %v", err)
			}
		}()
	}

	url := fmt.Sprintf("%s/broker/connect/%s", strings.Replace(c.config.ServerURL, "http", "ws", 1), c.config.Token)

	dialOpts := &websocket.DialOptions{}
	if c.tlsConfig != nil {
		dialOpts.HTTPClient = &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: c.tlsConfig,
			},
		}
	}

	conn, _, err := websocket.Dial(ctx, url, dialOpts)
	if err != nil {
		wsConnectionStatus.Set(0)
		return fmt.Errorf("failed to connect to server: %w", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	conn.SetReadLimit(32768 * 1000)

	c.conn = conn
	c.log.Info("Connected to server")
	wsConnectionStatus.Set(1)

	for {
		var msg protocol.BrokerMessage
		err := wsjson.Read(ctx, conn, &msg)
		if err != nil {
			wsConnectionStatus.Set(0)
			if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
				c.log.Errorf("Read error: %v", err)
			}
			return fmt.Errorf("read error: %w", err)
		}

		if msg.Type == protocol.MessageTypeRequest {
			var payload protocol.RequestPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				c.log.Errorf("Failed to unmarshal request payload: %v", err)
				continue
			}
			go func(payload protocol.RequestPayload) {
				c.handleRequest(ctx, payload)
			}(payload)
		} else if msg.Type == protocol.MessageTypeResponse {
			var payload protocol.ResponsePayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				c.log.Errorf("Failed to unmarshal response payload: %v", err)
				continue
			}
			c.pendingMu.Lock()
			ch, ok := c.pendingRequests[payload.ID]
			if ok {
				delete(c.pendingRequests, payload.ID)
			}
			c.pendingMu.Unlock()
			if ok {
				ch <- &payload
			}
		}
	}
}

func (c *Client) handleRequest(ctx context.Context, reqPayload protocol.RequestPayload) {
	body := reqPayload.Body
	if gjson.GetBytes(body, "BROKER_VAR_SUB").Exists() {
		paths := gjson.GetBytes(body, "BROKER_VAR_SUB")
		for _, p := range paths.Array() {
			path := p.String()
			val := gjson.GetBytes(body, path).String()
			if val != "" {
				newVal := os.ExpandEnv(val)
				body, _ = sjson.SetBytes(body, path, newVal)
			}
		}
		body, _ = sjson.DeleteBytes(body, "BROKER_VAR_SUB")
	}

	var matchedOrigin string
	if c.filters != nil {
		u, _ := http.NewRequest(reqPayload.Method, reqPayload.URL, nil)
		match := c.filters.FindMatch("private", reqPayload.Method, u.URL.Path, body, u.URL.Query())
		if match == nil {
			c.log.WithFields(logrus.Fields{
				"method": reqPayload.Method,
				"url":    reqPayload.URL,
			}).Warn("Blocked downstream request by filter")
			c.sendErrorResponse(ctx, reqPayload.ID, http.StatusForbidden, "Blocked by filter")
			return
		}
		if match.Origin != "" {
			matchedOrigin = os.ExpandEnv(match.Origin)
		}
	}

	var targetURL string
	if matchedOrigin != "" {
		targetURL = strings.TrimRight(matchedOrigin, "/") + reqPayload.URL
	} else {
		targetURL = c.config.TargetURL + reqPayload.URL
	}

	req, err := http.NewRequestWithContext(ctx, reqPayload.Method, targetURL, bytes.NewReader(body))
	if err != nil {
		c.log.Errorf("Failed to create request: %v", err)
		return
	}

	for k, v := range reqPayload.Headers {
		for _, val := range v {
			req.Header.Add(k, val)
		}
	}

	if vars := req.Header.Get("x-broker-var-sub"); vars != "" {
		for _, path := range strings.Split(vars, ",") {
			path = strings.TrimSpace(path)
			val := req.Header.Get(path)
			if val != "" {
				req.Header.Set(path, os.ExpandEnv(val))
			}
		}
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Do(req)
	
	if err != nil {
		c.log.Errorf("Request failed: %v", err)
		c.sendErrorResponse(ctx, reqPayload.ID, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	if reqPayload.StreamingID != "" {
		if err := c.streamResponseToServer(ctx, reqPayload.StreamingID, resp); err != nil {
			c.log.Errorf("Failed to stream response: %v", err)
		}
	} else {
		respBody, _ := io.ReadAll(resp.Body)
		respPayload := protocol.ResponsePayload{
			ID:         reqPayload.ID,
			StatusCode: resp.StatusCode,
			Headers:    resp.Header,
			Body:       respBody,
		}
		
		payloadBytes, _ := json.Marshal(respPayload)
		msg := protocol.BrokerMessage{
			Type:    protocol.MessageTypeResponse,
			Payload: payloadBytes,
		}

		c.mu.Lock()
		defer c.mu.Unlock()
		if err := wsjson.Write(ctx, c.conn, msg); err != nil {
			c.log.Errorf("Failed to send response: %v", err)
		}
	}
}

func (c *Client) streamResponseToServer(ctx context.Context, streamingID string, resp *http.Response) error {
	metadata := struct {
		Status  int                 `json:"status"`
		Headers map[string][]string `json:"headers"`
	}{
		Status:  resp.StatusCode,
		Headers: resp.Header,
	}
	
	jsonBytes, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	
	jsonLen := uint32(len(jsonBytes))
	pr, pw := io.Pipe()
	
	go func() {
		defer pw.Close()
		binary.Write(pw, binary.LittleEndian, jsonLen)
		pw.Write(jsonBytes)
		io.Copy(pw, resp.Body)
	}()
	
	url := fmt.Sprintf("%s/response-data/%s/%s", c.config.ServerURL, c.config.Token, streamingID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, pr)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	
	httpClient := &http.Client{Timeout: 60 * time.Second}
	if c.tlsConfig != nil {
		httpClient.Transport = &http.Transport{
			TLSClientConfig: c.tlsConfig,
		}
	}

	postResp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer postResp.Body.Close()
	
	if postResp.StatusCode != http.StatusOK {
		return fmt.Errorf("server rejected stream: %d", postResp.StatusCode)
	}
	
	return nil
}

func (c *Client) handleWebhook(w http.ResponseWriter, r *http.Request) {
	status := http.StatusOK
	defer func() {
		httpRequestsTotal.WithLabelValues("webhook", r.Method, fmt.Sprintf("%d", status)).Inc()
	}()

	if c.conn == nil {
		status = http.StatusServiceUnavailable
		http.Error(w, "Not connected to server", status)
		return
	}

	body, _ := io.ReadAll(r.Body)

	if c.filters != nil {
		match := c.filters.FindMatch("public", r.Method, r.URL.Path, body, r.URL.Query())
		if match == nil {
			c.log.WithFields(logrus.Fields{
				"method": r.Method,
				"url":    r.URL.Path,
			}).Warn("Blocked upstream webhook by filter")
			status = http.StatusForbidden
			http.Error(w, "Blocked by filter", status)
			return
		}
	}

	reqID := uuid.New().String()
	payload := protocol.RequestPayload{
		ID:      reqID,
		Method:  r.Method,
		URL:     r.URL.String(),
		Headers: r.Header,
		Body:    body,
	}

	payloadBytes, _ := json.Marshal(payload)
	msg := protocol.BrokerMessage{
		Type:    protocol.MessageTypeRequest,
		Payload: payloadBytes,
	}

	respCh := make(chan *protocol.ResponsePayload, 1)
	c.pendingMu.Lock()
	c.pendingRequests[reqID] = respCh
	c.pendingMu.Unlock()

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	c.mu.Lock()
	err := wsjson.Write(ctx, c.conn, msg)
	c.mu.Unlock()

	if err != nil {
		c.pendingMu.Lock()
		delete(c.pendingRequests, reqID)
		c.pendingMu.Unlock()
		status = http.StatusBadGateway
		http.Error(w, "Failed to forward webhook", status)
		return
	}

	select {
	case resp := <-respCh:
		for k, v := range resp.Headers {
			for _, val := range v {
				w.Header().Add(k, val)
			}
		}
		status = resp.StatusCode
		w.WriteHeader(status)
		w.Write(resp.Body)
	case <-ctx.Done():
		c.pendingMu.Lock()
		delete(c.pendingRequests, reqID)
		c.pendingMu.Unlock()
		status = http.StatusGatewayTimeout
		http.Error(w, "Timeout waiting for webhook response", status)
	}
}

func (c *Client) handleSystemCheck(w http.ResponseWriter, r *http.Request) {
	status := http.StatusOK
	defer func() {
		httpRequestsTotal.WithLabelValues("systemcheck", "GET", fmt.Sprintf("%d", status)).Inc()
	}()

	if c.config.ValidationURL == "" {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("[]"))
		return
	}

	req, err := http.NewRequest("GET", c.config.ValidationURL, nil)
	if err != nil {
		status = http.StatusInternalServerError
		http.Error(w, fmt.Sprintf("Failed to create validation request: %v", err), status)
		return
	}
	
	if c.config.ValidationAuthHeader != "" {
		req.Header.Set("Authorization", c.config.ValidationAuthHeader)
	}

	httpClient := &http.Client{Timeout: 5 * time.Second}
	if c.tlsConfig != nil {
		httpClient.Transport = &http.Transport{
			TLSClientConfig: c.tlsConfig,
		}
	}

	resp, err := httpClient.Do(req)
	
	result := map[string]interface{}{
		"brokerClientValidationUrl": c.config.ValidationURL,
		"ok": false,
	}

	if err != nil {
		result["error"] = err.Error()
		status = http.StatusBadGateway // Internal to systemcheck result
	} else {
		defer resp.Body.Close()
		result["brokerClientValidationUrlStatusCode"] = resp.StatusCode
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			result["ok"] = true
		} else {
			result["error"] = fmt.Sprintf("Status code is not 2xx: %d", resp.StatusCode)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]interface{}{result})
}

func (c *Client) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	if c.conn == nil {
		http.Error(w, "Not connected", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"ok": true}`))
}

func (c *Client) sendErrorResponse(ctx context.Context, reqID string, status int, msg string) {
	respPayload := protocol.ResponsePayload{
		ID:         reqID,
		StatusCode: status,
		Body:       []byte(msg),
	}
	payloadBytes, _ := json.Marshal(respPayload)
	brokerMsg := protocol.BrokerMessage{
		Type:    protocol.MessageTypeResponse,
		Payload: payloadBytes,
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	wsjson.Write(ctx, c.conn, brokerMsg)
}
