package filter

import (
	"net/url"
	"testing"
)

func TestMatch(t *testing.T) {
	jsonRules := []byte(`{
		"private": [
			{
				"method": "GET",
				"path": "/repos/:owner/:repo"
			},
			{
				"method": "GET",
				"path": "/repos/:owner/:repo/contents/:path*"
			},
			{
				"method": "POST",
				"path": "/repos/:owner/:repo/hooks"
			}
		],
		"public": [
			{
				"method": "POST",
				"path": "/webhook/github",
				"valid": [
					{
						"path": "commits.*.added.*",
						"value": "package.json"
					},
					{
						"queryParam": "secret",
						"values": ["topsecret*"]
					}
				]
			}
		]
	}`)

	rules, err := LoadRules(jsonRules)
	if err != nil {
		t.Fatalf("Failed to load rules: %v", err)
	}

	privateTests := []struct {
		method string
		path   string
		expect bool
	}{
		{"GET", "/repos/snyk/broker", true},
		{"GET", "/repos/snyk/broker/other", false},
		{"GET", "/repos/snyk/broker/contents/package.json", true},
		{"GET", "/repos/snyk/broker/contents/src/main.go", true},
		{"POST", "/repos/snyk/broker/hooks", true},
	}

	for _, tt := range privateTests {
		match := rules.FindMatch("private", tt.method, tt.path, nil, nil)
		if (match != nil) != tt.expect {
			t.Errorf("Private Match(%q, %q) = %v, expected %v", tt.method, tt.path, match != nil, tt.expect)
		}
	}

	publicTests := []struct {
		method string
		path   string
		body   string
		query  string
		expect bool
	}{
		{"POST", "/webhook/github", `{"commits": [{"added": ["package.json"]}]}`, "", true},
		{"POST", "/webhook/github", `{"commits": [{"added": ["other.js"]}]}`, "", false},
		{"POST", "/webhook/github", `{}`, "secret=topsecret123", true},
		{"POST", "/webhook/github", `{}`, "secret=wrong", false},
	}

	for _, tt := range publicTests {
		q, _ := url.ParseQuery(tt.query)
		match := rules.FindMatch("public", tt.method, tt.path, []byte(tt.body), q)
		if (match != nil) != tt.expect {
			t.Errorf("Public Match(%q, %q, %q, %q) = %v, expected %v", tt.method, tt.path, tt.body, tt.query, match != nil, tt.expect)
		}
	}
}
