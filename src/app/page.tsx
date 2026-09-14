import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Users,
  MessageSquare,
  Calendar,
  Video,
  Building2,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="text-xl font-bold text-primary">Dyne</div>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-20 md:py-32 text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Your Campus.<br />
            <span className="text-primary">Your Community.</span><br />
            Your Network.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground">
            Dyne is the private social network for Macro Vision Academy. Connect with classmates,
            join communities, discover events, and share your campus life.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                Join Dyne <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Sign in
              </Button>
            </Link>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.name} className="border-0 bg-transparent shadow-none">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{feature.name}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-16 text-center">
            <h2 className="mb-4 text-3xl font-bold">Ready to join your campus network?</h2>
            <p className="mb-8 max-w-xl mx-auto text-muted-foreground">
              Sign up with your MVA email address and start connecting today.
            </p>
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Create your account <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 Dyne. Built for Macro Vision Academy.</p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    name: "Feed & Communities",
    description: "Share posts, join class groups, clubs, and interest communities.",
    icon: Users,
  },
  {
    name: "Real-time Chat",
    description: "Direct messages and group conversations with classmates.",
    icon: MessageSquare,
  },
  {
    name: "Events & Calendar",
    description: "Discover campus events, RSVP, and never miss what's happening.",
    icon: Calendar,
  },
  {
    name: "Dyne Watch",
    description: "Campus video platform for lectures, events, and creativity.",
    icon: Video,
  },
  {
    name: "Campus Guide",
    description: "Explore buildings, facilities, and important locations.",
    icon: Building2,
  },
  {
    name: "Smart Notifications",
    description: "Stay updated with follows, likes, mentions, and messages.",
    icon: Sparkles,
  },
];