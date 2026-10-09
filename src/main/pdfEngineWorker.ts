import { parentPort, workerData } from 'node:worker_threads'
import { removePdfContent } from './pdfEngine'
removePdfContent(workerData.bytes, workerData.regions, workerData.secure).then(
  bytes => parentPort?.postMessage({bytes}),
  error => parentPort?.postMessage({error: String(error)})
)
