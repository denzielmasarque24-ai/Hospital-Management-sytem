This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Messaging Setup

The Message page uses the existing Supabase browser client and the signed-in user's session. Copy `.env.local.example` to `.env.local` and provide the project URL and a public anon/publishable key. Never use a `service_role` key in a `NEXT_PUBLIC_` variable; it bypasses Row Level Security and is exposed to every browser. If a service-role key has been published, rotate it in the Supabase dashboard.

Apply `supabase/migrations/20261016000000_create_messaging.sql` to create the conversations and messages tables, staff authorization function, and Row Level Security policies. To authorize a hospital staff member, add their Supabase Auth user ID to `public.hospital_staff` using the Supabase SQL editor or another trusted administrative process. Staff can then use the Message page to view conversations and reply; ordinary users can only access their own conversation.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
