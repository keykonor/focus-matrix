# Security and private data

Do not attach real task stores, exported histories, pairing/share URLs, database
exports, DPAPI files, deployment configuration or signing keys to public issues.
Use fabricated examples and remove URL fragments and Authorization headers.

For suspected credential exposure, revoke the affected credential through its
provider before discussing it publicly. The maintainer has not configured a
dedicated private security inbox; do not post an exploit containing live secrets.

The repository does not include the maintainer's cloud write credentials. A
fresh installation supports local work; the existing cloud integration requires
separate private configuration and is not a public multi-account hosted service.

Release installers are currently unsigned. Obtain them from this repository's
Releases page and compare SHA256SUMS.txt. GitHub-hosted builds and checksums
identify the distributed files; they do not replace a Windows signing certificate.
