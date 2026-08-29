# Storefront commerce, content and media

- Optimize product and editorial images through the Next.js image pipeline or the approved third-party media transformation URL.
- Require dimensions/aspect behavior to prevent layout shift; meaningful images need useful alt text.
- Product variant and combo composition must be visible before add-to-cart. A fixed combo is treated as one sellable unit.
- Reviews display moderation-approved content only and distinguish verified-purchase data when the API provides it.
- Guest checkout still creates or links a customer record after phone/email verification; do not model it as anonymous data loss.
- Partial product returns may be requested, but a fixed combo must be returned as the complete combo.
