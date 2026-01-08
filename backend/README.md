# OP-Blog — Backend

[![Node](https://img.shields.io/badge/node-18%2B-%2343853d)]()
[![TypeScript](https://img.shields.io/badge/typescript-5.9-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

## One-line
A production-minded Express + TypeScript REST API for a blogging platform (users, posts, comments, categories, image uploads). Built with ESM, typed environment validation, Zod validation, and tests (Jest + mongodb-memory-server).

---

## Features
- User authentication (JWT) — register, login, protected endpoints
- Posts, comments, categories CRUD  
- Image upload integration with Cloudinary (memory upload + streaming) 
- Input validation with Zod  
- TypeScript + ESM (Node `nodenext`)  
- Unit + integration + e2e tests (Jest + mongodb-memory-server)  
- Graceful shutdown, error handling, typed environment validation

---

## Tech stack
- Node.js 18+ (ESM)
- TypeScript
- Express
- MongoDB (Mongoose)
- Cloudinary (media)
- Zod (validation)
- Jest (tests) + mongodb-memory-server for integration & e2e tests
- ESLint + Prettier

---

## Quick start (development)

### Prerequisites
- Node 18+ installed
- MongoDB for local dev (or skip if you use in-memory DB for tests)
- Cloudinary account (for image uploads) — optional for local dev

### Install
```bash
git clone git@github.com:onepiece-coding/mern-stack-and-next.js-blog-pro.git
cd backend
npm install
npm run dev
```

- **note:** You can Import postman folder to your local workspace to test endpoints

---

## Contact

Email: mohamed.bouderya@gmail.com
Project: https://github.com/onepiece-coding/mern-stack-and-next.js-blog-pro