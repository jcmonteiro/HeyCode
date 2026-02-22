#!/usr/bin/env node
import http from "node:http"
import { loadConfig } from "../src/config/config.js"
import { transcribeFile } from "../src/usecases/transcribeFile.js"

const parseJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
    })
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (error) {
        reject(error)
      }
    })
  })

const start = async () => {
  const config = await loadConfig()
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/transcribe") {
      try {
        const body = await parseJsonBody(req)
        if (!body.file) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "file is required" }))
          return
        }
        const transcript = await transcribeFile({
          config,
          filePath: body.file,
        })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ text: transcript.text, meta: transcript.meta }))
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        )
      }
      return
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "not found" }))
  })

  server.listen(config.server.port, config.server.host, () => {
    process.stdout.write(
      `speechd listening on http://${config.server.host}:${config.server.port}\n`,
    )
  })
}

start().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
