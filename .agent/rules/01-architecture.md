# Architecture boundaries

- `api` is a modular NestJS application organized by business domain; controllers do HTTP mapping, services execute use cases, and persistence adapters stay replaceable.
- `client` is the public Next.js storefront/PWA. It must not import admin source or protected admin SDK modules.
- `admin` is the React/Ant Design operations portal. Tailwind handles layout; Ant Design handles complex controls and interaction.
- Cross-application contracts come only from generated OpenAPI SDKs.
- V1 remains a modular monolith. Do not introduce microservices, Kafka, CQRS infrastructure, or distributed transactions without a measured need.
