import Link from "next/link";

import { Button, buttonVariants } from "../ui/button";
import Image from "next/image";
import Logo from "@/public/logo.png";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export async function Navbar() {
  return (
    <nav className="flex justify-between items-center py-5">
      <Link href="/" className="flex items-center gap-2">
        <Image src={Logo} alt="Job Marshal Logo" width={40} height={40} />
        <h1 className="text-2xl font-bold">
          Job<span className="text-primary">Marshal</span>
        </h1>
      </Link>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        <Button>Login</Button>
      </div>
    </nav>
  );
}
