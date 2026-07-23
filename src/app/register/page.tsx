import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const me = await getCurrentUser();
  if (me) redirect("/");

  return <RegisterForm />;
}
