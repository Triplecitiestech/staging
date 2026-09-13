import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getFieldSession } from '@/lib/field/session'
import { FIELD_LOGIN_PATH, FIELD_PENDING_COOKIE, FIELD_ROOT } from '@/lib/field/edge'
import LoginCodeForm from '@/components/field/LoginCodeForm'

export default async function FieldLoginCodePage() {
  if (await getFieldSession()) redirect(FIELD_ROOT)
  // No pending request in this browser → nothing to verify against.
  const store = await cookies()
  if (!store.get(FIELD_PENDING_COOKIE)?.value) redirect(FIELD_LOGIN_PATH)

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-8 text-center text-xl font-semibold">Triple Cities Tech — Field Playbook</h1>
      <LoginCodeForm />
    </main>
  )
}
