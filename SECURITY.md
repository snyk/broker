# How to contact us

Please send any issue that you feel affects the security of this module to
**security@snyk.io**.

# Expectations

Please do not log security concerns as GitHub issues, as that could alert attackers to a potential flaw. If you want to nudge us beyond the email to **security@snyk.io**, tell us you sent such an email (without the details) on another channel, such as:
* An issue here on GitHub, with an email address we can use to contact you
  for a more detailed report.
* Send an email to support@snyk.io
* Message [@snyksec](https://twitter.com/snyksec) on Twitter.

# Known vulnerabilities

| CVE | Versions affected | Additional information | Reported by |
|-|-|-|-|
| [CVE-2020-7648](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570607) | <= 4.72.1 | Allows arbitrary file reads by appending the URL with a fragment identifier and a whitelisted path | Wing Chan of The Hut Group |
| [CVE-2020-7649](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570608) | < 4.73.0 | Allows arbitrary file reads via directory traversal | Wing Chan of The Hut Group |
| [CVE-2020-7650](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570609) | <= 4.73.0 | Allow arbitrary file reads of any files ending in the following extensions: yaml, yml or json | Wing Chan of The Hut Group |
| [CVE-2020-7651](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570610) | < 4.79.0 | Allows partial file reads via patch history from GitHub Commits API | Wing Chan of The Hut Group |
| [CVE-2020-7652](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570611) | < 4.80.0 | Allows arbitrary file reads by renaming files to match whitelisted paths | Wing Chan of The Hut Group |
| [CVE-2020-7653](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570612) | < 4.80.0 | Allows arbitrary file reads by creating symlinks to match whitelisted paths | Wing Chan of The Hut Group |
| [CVE-2020-7654](https://snyk.io/vuln/SNYK-JS-SNYKBROKER-570613) | <= 4.73.0 | Logs private keys if logging level is set to DEBUG | Wing Chan of The Hut Group |
