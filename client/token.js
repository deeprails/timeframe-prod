// const { AssemblyAI } = require("assemblyai");
import { AssemblyAI } from "assemblyai"

const client = new AssemblyAI({
  apiKey: "",
});

client.streaming.createTemporaryToken({
  expires_in_seconds: 600
}).then((token) => {
  console.log(token)
})