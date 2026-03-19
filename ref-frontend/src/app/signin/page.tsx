import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import SigninClient from "./signin-client"

export default async function SigninPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value

  if (token) {
    redirect("/dashboard")
  }

  return <SigninClient />
}
