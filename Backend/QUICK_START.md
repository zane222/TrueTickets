# Quick Start Guide

## Build

```bash
cd Backend2/TrueTickets
cargo lambda build --release --arm64
```

Output: `target/lambda/TrueTickets/bootstrap` (5.6 MB)

## Test

```bash
cd Backend2/TrueTickets
cargo test
```

Expected: `test result: ok. 7 passed; 0 failed`

## Package for AWS

```bash
cd Backend2/TrueTickets/target/lambda/TrueTickets
zip function.zip bootstrap
```

Output: `function.zip` (ready to deploy)

## Deploy to Lambda

```bash
aws lambda create-function \
  --function-name TrueTickets-Rust \
  --runtime provided.al2 \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-role \
  --handler bootstrap \
  --zip-file fileb://function.zip \
  --environment Variables={REPAIRSHOPR_API_KEY=your_key}
```

## Update Existing Lambda

```bash
aws lambda update-function-code \
  --function-name TrueTickets \
  --zip-file fileb://function.zip
```

## All Commands (One-Liner)

```bash
cd Backend2/TrueTickets && cargo test && cargo lambda build --release && cd target/lambda/TrueTickets && zip function.zip bootstrap && echo "✅ Ready to deploy!"
```

## Requirements

- Rust 1.70+
- `cargo-lambda` installed: `cargo install cargo-lambda`
- AWS CLI (for deployment)

## Environment Variable

```bash
REPAIRSHOPR_API_KEY=your_api_key_here
```

That's it! 🚀
