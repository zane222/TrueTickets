# True Tickets

True Tickets is a full-stack ticket management system designed for local electronics repair shops, built with React, TypeScript, and AWS services.

## How to Run

### Compile Backend

```cargo lambda build --release --arm64```

### Build Frontend

```npm run build```

### Build AWS Infrastructure

Not yet finished with Infrastructure, see comment in main.tf, for now it's still manual

```tofu apply```

## Backend Documentation

The backend code is written in Rust and is fully documented. The documentation includes detailed explanations of:
- API Handlers
- Database Interactions (DynamoDB Tables & Indexes)
- Logic & Business Rules

### Viewing the Documentation

To generate and view the backend documentation locally in your browser, navigate to the `Backend` directory and run:

```bash
cargo doc --open --no-deps
```

This will compile the documentation and automatically open it in your default web browser.
