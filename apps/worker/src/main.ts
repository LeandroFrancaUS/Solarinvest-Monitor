import { Worker, Queue } from 'bullmq'

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379'),
}

const pollingWorker = new Worker(
  'polling',
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`)
    // TODO: implement inverter polling
  },
  { connection }
)

pollingWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`)
})

pollingWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`)
})

console.log('Worker started')
