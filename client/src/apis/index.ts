import axios from "axios"
import { API_BASE_URL } from "../config"
axios.defaults.baseURL = API_BASE_URL


export async function startCoreLoopApiCall() {
  try {
    const res = await axios.get<StartLoopResponse>("/start-loop")
    return res.data
  } catch (error) {
    console.error(error)
    return false
  }
}

export async function stopCoreLoopApiCall(broadcastIdle: boolean = true) {
  try {
    const res = await axios.get<StopLoopResponse>(`/stop-loop?broadcast=${broadcastIdle}`)
    return res.data
  } catch (error) {
    console.error(error)
    return false
  }
}

export async function getAAIToken() {
  try {
    const res = await axios.get<GetAAITokenResponse>("/get-aai-token")
    return res.data
  } catch (error) {
    console.error(error)
    return false
  }
}