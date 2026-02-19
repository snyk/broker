package filter

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/gobwas/glob"
)

type Validation struct {
	Path       string   `json:"path"`
	Value      string   `json:"value"`
	Regex      string   `json:"regex"`
	QueryParam string   `json:"queryParam"`
	Values     []string `json:"values"`
}

type Rule struct {
	Method string       `json:"method"`
	Path   string       `json:"path"`
	Origin string       `json:"origin"`
	Valid  []Validation `json:"valid"`
	
	pathRegex *regexp.Regexp
}

type Rules struct {
	Public  []*Rule `json:"public"`
	Private []*Rule `json:"private"`
}

func LoadRules(data []byte) (*Rules, error) {
	var rules Rules
	if err := json.Unmarshal(data, &rules); err != nil {
		return nil, err
	}

	for _, r := range rules.Public {
		if err := r.Compile(); err != nil {
			return nil, err
		}
	}
	for _, r := range rules.Private {
		if err := r.Compile(); err != nil {
			return nil, err
		}
	}
	return &rules, nil
}

func (r *Rule) Compile() error {
	parts := strings.Split(r.Path, "/")
	var regexParts []string
	
	for _, part := range parts {
		if part == "" {
			continue
		}
		
		if strings.HasPrefix(part, ":") {
			if strings.HasSuffix(part, "*") {
				regexParts = append(regexParts, "(.*)")
			} else {
				regexParts = append(regexParts, "([^/]+)")
			}
		} else if part == "*" {
			regexParts = append(regexParts, ".*")
		} else {
			regexParts = append(regexParts, regexp.QuoteMeta(part))
		}
	}
	
	pattern := "^"
	if strings.HasPrefix(r.Path, "/") {
		pattern += "/"
	}
	pattern += strings.Join(regexParts, "/") + "$"
	
	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Errorf("invalid path pattern %q: %v", r.Path, err)
	}
	r.pathRegex = re
	return nil
}

func (r *Rule) Matches(method, path string, body []byte, query url.Values) bool {
	if !strings.EqualFold(r.Method, method) && !strings.EqualFold(r.Method, "any") {
		return false
	}
	if !r.pathRegex.MatchString(path) {
		return false
	}
	
	if len(r.Valid) == 0 {
		return true
	}
	
	var bodyFilters []Validation
	var bodyRegexFilters []Validation
	var queryFilters []Validation
	
	for _, v := range r.Valid {
		if v.Path != "" {
			if v.Regex != "" {
				bodyRegexFilters = append(bodyRegexFilters, v)
			} else {
				bodyFilters = append(bodyFilters, v)
			}
		} else if v.QueryParam != "" {
			queryFilters = append(queryFilters, v)
		}
	}
	
	if len(bodyFilters) == 0 && len(bodyRegexFilters) == 0 && len(queryFilters) == 0 {
		return true
	}
	
	var parsedBody interface{}
	if len(bodyFilters) > 0 || len(bodyRegexFilters) > 0 {
		json.Unmarshal(body, &parsedBody)
	}
	
	isValid := false
	
	// Check Body Filters
	if len(bodyFilters) > 0 {
		for _, f := range bodyFilters {
			if matchJSONPath(parsedBody, strings.Split(f.Path, "."), f.Value, "") {
				isValid = true
				break
			}
		}
	}
	
	// Check Body Regex Filters
	if !isValid && len(bodyRegexFilters) > 0 {
		for _, f := range bodyRegexFilters {
			if matchJSONPath(parsedBody, strings.Split(f.Path, "."), "", f.Regex) {
				isValid = true
				break
			}
		}
	}
	
	// Check Query Filters
	if !isValid && len(queryFilters) > 0 {
		queryValid := true
		for _, f := range queryFilters {
			val := query.Get(f.QueryParam)
			matched := false
			for _, allowed := range f.Values {
				g, err := glob.Compile(allowed)
				if err == nil {
					if g.Match(val) {
						matched = true
						break
					}
				} else {
					if val == allowed {
						matched = true
						break
					}
				}
			}
			if !matched {
				queryValid = false
				break
			}
		}
		if len(queryFilters) > 0 {
			isValid = queryValid
		}
	}
	
	return isValid
}

func matchJSONPath(data interface{}, path []string, value string, regex string) bool {
	if len(path) == 0 {
		strVal := fmt.Sprintf("%v", data)
		if regex != "" {
			matched, _ := regexp.MatchString(regex, strVal)
			return matched
		}
		return strVal == value
	}
	
	part := path[0]
	remaining := path[1:]
	
	if part == "*" {
		// If current data is array, check all items
		if arr, ok := data.([]interface{}); ok {
			for _, item := range arr {
				if matchJSONPath(item, remaining, value, regex) {
					return true
				}
			}
		}
		// If current data is map, check all values? 
		// Snyk * usually means array index or any key.
		if m, ok := data.(map[string]interface{}); ok {
			for _, v := range m {
				if matchJSONPath(v, remaining, value, regex) {
					return true
				}
			}
		}
		return false
	}
	
	// Normal segment
	if m, ok := data.(map[string]interface{}); ok {
		if v, ok := m[part]; ok {
			return matchJSONPath(v, remaining, value, regex)
		}
	}
	
	return false
}

func (rs *Rules) FindMatch(listType string, method, path string, body []byte, query url.Values) *Rule {
	var list []*Rule
	if listType == "public" {
		list = rs.Public
	} else {
		list = rs.Private
	}

	for _, r := range list {
		if r.Matches(method, path, body, query) {
			return r
		}
	}
	return nil
}
