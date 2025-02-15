# Twerker

A powerful and type-safe TypeScript worker thread pool implementation for Node.js.

[![npm version](https://badge.fury.io/js/twerker.svg)](https://badge.fury.io/js/twerker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/twerker)](https://nodejs.org)

## Features

- 🚀 Simple and intuitive API for managing worker threads
- 💪 Fully type-safe with TypeScript
- 🔄 Automatic thread pool management
- 📊 Dynamic task queuing and distribution
- 🎯 Console output forwarding from workers
- ⚡ Built for performance with minimal overhead
- 🛡️ Robust error handling

## Installation

```bash
pnpm add twerker
```

If you're starting a new project, you can initialize it with pnpm first:

```bash
pnpm init
pnpm add -D typescript @types/node
pnpm add twerker
```

## Quick Start

Create two separate files: one for defining your worker and another for using it. Name your worker file using kebab-case to match the function it implements.

> ⚠️ **Warning**: Always use `createPool()` for running multiple tasks. Do not use `Promise.all()` with multiple `.run()` calls, as this will create a new worker thread for each task, which is inefficient and can overwhelm your system.

### `heavy-computation.ts` - Define your worker
```