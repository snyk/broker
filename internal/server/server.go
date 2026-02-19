package server

import (
	"bytes"
	"context"
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
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "broker_server_http_requests_total",
			Help: "Total number of HTTP requests handled by the broker server.",
		},
		[]string{"path", "method", "status"},
	)
	wsConnectionsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "broker_server_ws_connections_total",
			Help: "Total number of WebSocket connections to the broker server.",
		},
		[]string{"token", "event"},
	)
)

func init() {
	prometheus.MustRegister(httpRequestsTotal)
	prometheus.MustRegister(wsConnectionsTotal)
}

type Config struct {
	Port        int
	UpstreamURL string // URL to Snyk API
	FilterPath  string // Path to accept-server.json filters
	CertPath    string // HTTPS Cert
	KeyPath     string // HTTPS Key
}

type Connection struct {
	conn            *websocket.Conn
	pendingRequests map[string]chan *protocol.ResponsePayload
	mu              sync.Mutex // Protects pendingRequests
	writeMu         sync.Mutex // Protects conn writes
}

type StreamRegistry struct {
	streams map[string]*io.PipeWriter
	mu      sync.Mutex
}

type Server struct {
	config      Config
	server      *http.Server
	connections map[string]*Connection
	connsMu     sync.RWMutex
	streams     StreamRegistry
	filters     *filter.Rules
	log         *logrus.Logger
}

func NewServer(config Config) *Server {
	l := logrus.New()
	l.SetFormatter(&logrus.JSONFormatter{})
	return &Server{
		config:      config,
		connections: make(map[string]*Connection),
		streams: StreamRegistry{
			streams: make(map[string]*io.PipeWriter),
		},
		log: l,
	}
}

func (s *Server) Start() error {
	if s.config.FilterPath != "" {
		data, err := os.ReadFile(s.config.FilterPath)
		if err != nil {
			s.log.Errorf("Warning: failed to read filter file: %v", err)
		} else {
			rules, err := filter.LoadRules(data)
			if err != nil {
				return fmt.Errorf("failed to load filter rules: %w", err)
			}
			s.filters = rules
			s.log.Infof("Loaded server filters from %s", s.config.FilterPath)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthcheck", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	mux.Handle("/metrics", promhttp.Handler())

	mux.HandleFunc("/broker/connect/", s.handleConnect)
	mux.HandleFunc("/broker/", s.handleProxy)
	mux.HandleFunc("/response-data/", s.handlePostResponse)
	mux.HandleFunc("/hidden/brokers/response-data/", s.handlePostResponse)

	s.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", s.config.Port),
		Handler: mux,
	}

	if s.config.CertPath != "" && s.config.KeyPath != "" {
		s.log.Infof("Server listening on HTTPS :%d", s.config.Port)
		return s.server.ListenAndServeTLS(s.config.CertPath, s.config.KeyPath)
	}

	s.log.Infof("Server listening on HTTP :%d", s.config.Port)
	return s.server.ListenAndServe()
}

func (s *Server) Stop() error {
	if s.server != nil {
		return s.server.Shutdown(context.Background())
	}
	return nil
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	token := parts[3]

	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		s.log.Errorf("Failed to upgrade connection: %v", err)
		return
	}
	c.SetReadLimit(32768 * 1000)

	conn := &Connection{
		conn:            c,
		pendingRequests: make(map[string]chan *protocol.ResponsePayload),
	}

	s.connsMu.Lock()
	s.connections[token] = conn
	s.connsMu.Unlock()

	s.log.WithField("token", token).Info("Client connected")
	wsConnectionsTotal.WithLabelValues(token, "connected").Inc()

	defer func() {
		s.connsMu.Lock()
		delete(s.connections, token)
		s.connsMu.Unlock()
		c.Close(websocket.StatusNormalClosure, "")
		s.log.WithField("token", token).Info("Client disconnected")
		wsConnectionsTotal.WithLabelValues(token, "disconnected").Inc()
	}()

	for {
		var msg protocol.BrokerMessage
		err := wsjson.Read(context.Background(), c, &msg)
		if err != nil {
			if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
				s.log.Errorf("Read error: %v", err)
			}
			break
		}

		if msg.Type == protocol.MessageTypeResponse {
			var payload protocol.ResponsePayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				s.log.Errorf("Failed to unmarshal response payload: %v", err)
				continue
			}

			conn.mu.Lock()
			ch, ok := conn.pendingRequests[payload.ID]
			if ok {
				delete(conn.pendingRequests, payload.ID)
			}
			conn.mu.Unlock()

			if ok {
				ch <- &payload
			}
		} else if msg.Type == protocol.MessageTypeRequest {
			var payload protocol.RequestPayload
			if err := json.Unmarshal(msg.Payload, &payload); err != nil {
				s.log.Errorf("Failed to unmarshal request payload: %v", err)
				continue
			}
			go s.handleUpstreamRequest(conn, payload)
		}
	}
}

func (s *Server) handleUpstreamRequest(conn *Connection, reqPayload protocol.RequestPayload) {
	if s.filters != nil {
		u, _ := http.NewRequest(reqPayload.Method, reqPayload.URL, nil)
		match := s.filters.FindMatch("public", reqPayload.Method, u.URL.Path, reqPayload.Body, u.URL.Query())
		if match == nil {
			s.log.WithFields(logrus.Fields{
				"method": reqPayload.Method,
				"url":    reqPayload.URL,
			}).Warn("Blocked upstream request by filter")
			
			respPayload := protocol.ResponsePayload{
				ID:         reqPayload.ID,
				StatusCode: http.StatusForbidden,
				Body:       []byte("Blocked by filter"),
			}
			payloadBytes, _ := json.Marshal(respPayload)
			msg := protocol.BrokerMessage{
				Type:    protocol.MessageTypeResponse,
				Payload: payloadBytes,
			}
			s.writeToConn(context.Background(), conn, msg)
			return
		}
	}

	if s.config.UpstreamURL == "" {
		s.log.Warn("Upstream URL not configured")
		return
	}

	targetURL := s.config.UpstreamURL + reqPayload.URL
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, reqPayload.Method, targetURL, bytes.NewReader(reqPayload.Body))
	if err != nil {
		s.log.Errorf("Failed to create upstream request: %v", err)
		return
	}

	for k, v := range reqPayload.Headers {
		for _, val := range v {
			req.Header.Add(k, val)
		}
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)

	var respPayload protocol.ResponsePayload
	respPayload.ID = reqPayload.ID

	if err != nil {
		s.log.Errorf("Upstream Request failed: %v", err)
		respPayload.StatusCode = http.StatusBadGateway
		respPayload.Body = []byte(err.Error())
	} else {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		respPayload.StatusCode = resp.StatusCode
		respPayload.Headers = resp.Header
		respPayload.Body = body
	}

	payloadBytes, _ := json.Marshal(respPayload)
	msg := protocol.BrokerMessage{
		Type:    protocol.MessageTypeResponse,
		Payload: payloadBytes,
	}

	if err := s.writeToConn(context.Background(), conn, msg); err != nil {
		s.log.Errorf("Failed to send upstream response: %v", err)
	}
}

type StreamEvent struct {
	Status    int
	Headers   map[string][]string
	BodyChunk []byte
	IsMeta    bool
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	status := http.StatusOK
	defer func() {
		httpRequestsTotal.WithLabelValues(r.URL.Path, r.Method, fmt.Sprintf("%d", status)).Inc()
	}()

	parts := strings.SplitN(r.URL.Path, "/", 4)
	if len(parts) < 3 {
		status = http.StatusBadRequest
		http.Error(w, "Invalid path", status)
		return
	}
	token := parts[2]
	targetPath := "/"
	if len(parts) > 3 {
		targetPath += parts[3]
	}

	s.connsMu.RLock()
	conn, ok := s.connections[token]
	s.connsMu.RUnlock()

	if !ok {
		status = http.StatusNotFound
		http.Error(w, "Client not connected", status)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		status = http.StatusInternalServerError
		http.Error(w, "Failed to read body", status)
		return
	}

	reqID := uuid.New().String()
	streamingID := uuid.New().String()

	payload := protocol.RequestPayload{
		ID:          reqID,
		Method:      r.Method,
		URL:         targetPath,
		Headers:     r.Header,
		Body:        body,
		StreamingID: streamingID,
	}

	payloadBytes, _ := json.Marshal(payload)
	msg := protocol.BrokerMessage{
		Type:    protocol.MessageTypeRequest,
		Payload: payloadBytes,
	}

	respCh := make(chan *protocol.ResponsePayload, 1)
	conn.mu.Lock()
	conn.pendingRequests[reqID] = respCh
	conn.mu.Unlock()
	
	defer func() {
		conn.mu.Lock()
		delete(conn.pendingRequests, reqID)
		conn.mu.Unlock()
	}()

	pr, pw := io.Pipe()
	s.streams.mu.Lock()
	s.streams.streams[streamingID] = pw
	s.streams.mu.Unlock()

	defer func() {
		s.streams.mu.Lock()
		delete(s.streams.streams, streamingID)
		s.streams.mu.Unlock()
		pr.Close() 
		pw.CloseWithError(io.ErrClosedPipe) 
	}()

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := s.writeToConn(ctx, conn, msg); err != nil {
		status = http.StatusBadGateway
		http.Error(w, "Failed to send request to client", status)
		return
	}

	streamCh := make(chan StreamEvent)
	streamErrCh := make(chan error)
	
	go func() {
		defer close(streamCh)
		defer close(streamErrCh)
		
		var jsonLen uint32
		if err := binary.Read(pr, binary.LittleEndian, &jsonLen); err != nil {
			if err != io.EOF && err != io.ErrClosedPipe {
				streamErrCh <- fmt.Errorf("failed to read stream header: %w", err)
			}
			return
		}

		jsonBytes := make([]byte, jsonLen)
		if _, err := io.ReadFull(pr, jsonBytes); err != nil {
			streamErrCh <- fmt.Errorf("failed to read stream metadata: %w", err)
			return
		}

		var metadata struct {
			Status  int                 `json:"status"`
			Headers map[string][]string `json:"headers"`
		}
		if err := json.Unmarshal(jsonBytes, &metadata); err != nil {
			streamErrCh <- fmt.Errorf("invalid response metadata: %w", err)
			return
		}
		
		streamCh <- StreamEvent{
			Status: metadata.Status,
			Headers: metadata.Headers,
			IsMeta: true,
		}
		
		buf := make([]byte, 32*1024)
		for {
			n, err := pr.Read(buf)
			if n > 0 {
				chunk := make([]byte, n)
				copy(chunk, buf[:n])
				streamCh <- StreamEvent{
					BodyChunk: chunk,
				}
			}
			if err != nil {
				if err != io.EOF {
					streamErrCh <- err
				}
				break
			}
		}
	}()

	headerWritten := false
	
	for {
		select {
		case resp := <-respCh:
			if !headerWritten {
				for k, v := range resp.Headers {
					for _, val := range v {
						w.Header().Add(k, val)
					}
				}
				status = resp.StatusCode
				w.WriteHeader(status)
				headerWritten = true
			}
			w.Write(resp.Body)
			return 
			
		case evt, ok := <-streamCh:
			if !ok {
				return
			}
			if evt.IsMeta {
				if !headerWritten {
					for k, v := range evt.Headers {
						for _, val := range v {
							w.Header().Add(k, val)
						}
					}
					status = evt.Status
					w.WriteHeader(status)
					headerWritten = true
				}
			} else {
				if _, err := w.Write(evt.BodyChunk); err != nil {
					s.log.Errorf("Failed to write to response: %v", err)
					return
				}
			}
			
		case err, ok := <-streamErrCh:
			if !ok {
				continue
			}
			s.log.Errorf("Stream error: %v", err)
			if !headerWritten {
				status = http.StatusBadGateway
				http.Error(w, "Stream error", status)
			}
			return
			
		case <-ctx.Done():
			return
		}
	}
}

func (s *Server) handlePostResponse(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	path = strings.TrimPrefix(path, "/hidden/brokers")
	path = strings.TrimPrefix(path, "/response-data/")
	
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}
	streamingID := parts[1]

	s.streams.mu.Lock()
	pw, ok := s.streams.streams[streamingID]
	s.streams.mu.Unlock()

	if !ok {
		http.Error(w, "Stream not found", http.StatusNotFound)
		return
	}

	defer r.Body.Close()
	_, err := io.Copy(pw, r.Body)
	if err != nil {
		s.log.Errorf("Error copying post body to pipe: %v", err)
	}
	
	pw.Close()
	w.WriteHeader(http.StatusOK)
}

func (s *Server) writeToConn(ctx context.Context, conn *Connection, msg protocol.BrokerMessage) error {
	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()
	return wsjson.Write(ctx, conn.conn, msg)
}
