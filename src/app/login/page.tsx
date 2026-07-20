import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-fg">加载登录页…</div>}>
      <LoginForm />
    </Suspense>
  );
}