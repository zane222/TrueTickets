# Quick Start Guide

## Build

```bash
cd Backend/TrueTickets
cargo lambda build --release --arm64
```

Output: `target/lambda/TrueTickets/bootstrap` (5.6 MB)

## Test

```bash
cd Backend/TrueTickets
cargo test
```

## Package for AWS

```bash
cd Backend/TrueTickets/target/lambda/TrueTickets
zip function.zip bootstrap
```

Output: `function.zip` (ready to deploy)