import { redirect } from 'next/navigation'
import { getFieldSession } from '@/lib/field/session'
import { FIELD_ROOT } from '@/lib/field/edge'
import LoginEmailForm from '@/components/field/LoginEmailForm'

export default async function FieldLoginPage() {
  if (await getFieldSession()) redirect(FIELD_ROOT)

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-8 text-center text-xl font-semibold">Triple Cities Tech — Field Playbook</h1>
      <LoginEmailForm />
    </main>
  )
}
