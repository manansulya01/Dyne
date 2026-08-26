import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@clerk/nextjs";
import Head from "next/head";

export default function Home() {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (isLoaded && !userId) {
      router.push("/auth/sign-in");
    } else if (isLoaded && userId) {
      router.push("/dashboard");
    }
  }, [isLoaded, userId, router]);

  return (
    <>
      <Head>
        <title>Dyne - Student Life OS</title>
        <meta name="description" content="Your unified student life platform" />
      </Head>
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Dyne</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Loading your student life os...
          </p>
        </div>
      </div>
    </>
  );
}
