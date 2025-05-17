# Contributing to GuardUp Proxy Service

Thank you for your interest in contributing to GuardUp Proxy Service! We appreciate your time and effort in helping improve this project. Here's how you can contribute:

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Reporting Issues](#reporting-issues)
- [Feature Requests](#feature-requests)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [License](#license)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
   ```bash
   git clone https://github.com/your-username/guardup-proxy-service.git
   cd guardup-proxy-service
   ```
3. **Set up** the development environment
   ```bash
   pnpm install
   cp .env.example .env
   ```
4. **Create a branch** for your changes
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/short-bug-description
   ```

## Development Workflow

1. Make your changes
2. Run tests
   ```bash
   pnpm test
   ```
3. Ensure code passes linting
   ```bash
   pnpm lint
   ```
4. Format your code
   ```bash
   pnpm format
   ```
5. Commit your changes with a descriptive message
   ```
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve issue with connection handling"
   ```
6. Push to your fork
   ```bash
   git push origin your-branch-name
   ```
7. Open a Pull Request against the `main` branch

## Pull Request Guidelines

- Keep PRs focused on a single feature or bug fix
- Ensure all tests pass
- Update documentation as needed
- Follow the existing code style
- Include tests for new features
- Reference any related issues in your PR description
- Use a clear and descriptive title
- Keep your branch up to date with the latest changes from `main`

## Reporting Issues

When reporting issues, please include:

1. A clear, descriptive title
2. Steps to reproduce the issue
3. Expected behavior
4. Actual behavior
5. Environment details (OS, Node.js version, etc.)
6. Any relevant error messages or logs

## Feature Requests

We welcome suggestions for new features. Please:

1. Check if a similar feature request already exists
2. Explain why this feature would be valuable
3. Provide as much detail as possible about the proposed implementation

## Code Style

- Follow the existing code style in the codebase
- Use TypeScript types effectively
- Write clear, self-documenting code
- Keep functions focused and small
- Add comments where the code's purpose isn't immediately obvious

## Testing

- Write tests for new features and bug fixes
- Ensure all tests pass before submitting a PR
- Update tests when changing functionality
- Test edge cases and error conditions

## Documentation

- Update documentation when adding or changing features
- Keep code comments up to date
- Add examples where helpful
- Document any breaking changes

## License

By contributing to this project, you agree that your contributions will be licensed under its [MIT License](LICENSE).
