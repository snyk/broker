package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/snyk/broker/internal/client"
	"github.com/snyk/broker/internal/server"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: broker <client|server> [options]")
		os.Exit(1)
	}

	mode := os.Args[1]
	args := os.Args[2:]

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle SIGINT/SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("Received signal, shutting down...")
		cancel()
	}()

	switch mode {
	case "server":
		runServer(ctx, args)
	case "client":
		runClient(ctx, args)
	default:
		fmt.Printf("Unknown mode: %s\n", mode)
		os.Exit(1)
	}
}

func runServer(ctx context.Context, args []string) {
	fs := flag.NewFlagSet("server", flag.ExitOnError)
	port := fs.Int("port", 8000, "Port to listen on")
	upstream := fs.String("upstream", "", "Upstream URL (Snyk API)")
	cert := fs.String("cert", "", "HTTPS certificate path")
	key := fs.String("key", "", "HTTPS key path")
	accept := fs.String("accept", "", "Path to accept-server.json filters")
	
	fs.Parse(args)

	// Env var overrides
	if p := os.Getenv("PORT"); p != "" {
		if val, err := strconv.Atoi(p); err == nil {
			*port = val
		}
	}
	if u := os.Getenv("API_BASE_URL"); u != "" {
		*upstream = u
	}
	if c := os.Getenv("HTTPS_CERT"); c != "" {
		*cert = c
	}
	if k := os.Getenv("HTTPS_KEY"); k != "" {
		*key = k
	}
	if a := os.Getenv("ACCEPT"); a != "" {
		*accept = a
	}

	cfg := server.Config{
		Port:        *port,
		UpstreamURL: *upstream,
		CertPath:    *cert,
		KeyPath:     *key,
		FilterPath:  *accept,
	}

	srv := server.NewServer(cfg)
	
	go func() {
		<-ctx.Done()
		srv.Stop()
	}()

	if err := srv.Start(); err != nil && err != nil { 
		log.Printf("Server stopped: %v", err)
	}
}

func runClient(ctx context.Context, args []string) {
	fs := flag.NewFlagSet("client", flag.ExitOnError)
	serverURL := fs.String("url", "", "Broker Server URL")
	token := fs.String("token", "", "Broker Token")
	target := fs.String("target", "", "Target URL (Private Service)")
	port := fs.Int("port", 0, "Port to listen on (for webhooks)")
	filterPath := fs.String("accept", "accept.json", "Path to accept.json filters")
	ca := fs.String("ca", "", "CA certificate path")
	insecure := fs.Bool("insecure", false, "Skip server certificate verification")
	
	fs.Parse(args)

	// Env var overrides
	if u := os.Getenv("BROKER_SERVER_URL"); u != "" {
		*serverURL = u
	}
	if t := os.Getenv("BROKER_TOKEN"); t != "" {
		*token = t
	}
	if t := os.Getenv("BROKER_TARGET_URL"); t != "" {
		*target = t
	}
	if p := os.Getenv("PORT"); p != "" {
		if val, err := strconv.Atoi(p); err == nil {
			*port = val
		}
	}
	if f := os.Getenv("ACCEPT"); f != "" {
		*filterPath = f
	}
	if c := os.Getenv("CA_CERT"); c != "" {
		*ca = c
	}
	if os.Getenv("BROKER_TLS_REJECT_UNAUTHORIZED") == "false" || os.Getenv("NODE_TLS_REJECT_UNAUTHORIZED") == "0" {
		*insecure = true
	}
	
	*target = os.ExpandEnv(*target)
	validationURL := os.ExpandEnv(os.Getenv("BROKER_CLIENT_VALIDATION_URL"))
	validationAuth := os.Getenv("BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER")

	if *serverURL == "" || *token == "" {
		log.Println("Missing required config: --url and --token (or BROKER_SERVER_URL/BROKER_TOKEN)")
		fs.Usage()
		os.Exit(1)
	}

	cfg := client.Config{
		ServerURL:            *serverURL,
		Token:                *token,
		TargetURL:            *target,
		Port:                 *port,
		FilterPath:           *filterPath,
		ValidationURL:        validationURL,
		ValidationAuthHeader: validationAuth,
		CACertPath:           *ca,
		InsecureSkipVerify:   *insecure,
	}

	c := client.NewClient(cfg)
	if err := c.Start(ctx); err != nil {
		log.Fatalf("Client failed: %v", err)
	}
}
