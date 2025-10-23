import { socket } from "../apis/socket"

export default function useLogger() {

  function logInfo({ event, detail }: { event: string, detail?: string }) {
    const message = JSON.stringify({
      event: "info-log",
      data: {
        event,
        detail
      }
    })
    socket.send(message)
  }

  function logConv({ question, answer, q_timestamp, a_timestamp }: { question: string, answer: string, q_timestamp: Date, a_timestamp: Date }) {
    const message = JSON.stringify({
      event: "conversation-log",
      data: {
        question, answer, q_timestamp, a_timestamp
      }
    })
    socket.send(message)
  }

  function commitToDB() {
    const message = JSON.stringify({ event: "save-logs" })
    socket.send(message)
  }

  return {
    logInfo,
    logConv,
    commitToDB
  }
}
