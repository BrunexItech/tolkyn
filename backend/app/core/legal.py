"""Single source of truth for the platform's legal-document version.

Bump ``CURRENT_LEGAL_VERSION`` whenever the Terms of Service or Privacy Policy
change materially. Every user whose stored acceptance version no longer matches
is then required to re-accept before they can keep using the platform (see the
frontend TermsGate and ``UserService.accept_terms``).
"""

# ISO date of the last material change to /terms or /privacy on the frontend.
CURRENT_LEGAL_VERSION = "2026-09-05"
