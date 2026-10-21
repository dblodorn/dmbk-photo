"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { Button, Link, type ButtonProps, type LinkProps } from "reshaped";

/*
 * Reshaped's Button and Link, routed through Next's Link.
 *
 * Given an `href` alone, Reshaped renders a plain <a>, which makes every
 * admin navigation a full page load — and under force-dynamic, a fresh
 * session check and a flash of "Checking session…". Its `render` prop hands
 * over the element instead, so Next can intercept the click. One place for
 * that wiring rather than a render function at every call site.
 *
 * The cast: Reshaped types the attributes it passes to `render` as valid for
 * either a <button> or an <a>, since one Actionable renders both. With an
 * `href` they are always the anchor's, which is all Next's Link accepts.
 */
type AnchorAttributes = ComponentProps<typeof NextLink>;

type ButtonLinkProps = Omit<ButtonProps, "href" | "render" | "onClick" | "type"> & {
  href: string;
};

export function ButtonLink({ href, ...props }: ButtonLinkProps) {
  return (
    <Button
      {...props}
      href={href}
      render={(attributes) => (
        <NextLink {...(attributes as AnchorAttributes)} href={href} />
      )}
    />
  );
}

type TextLinkProps = Omit<LinkProps, "href" | "render" | "onClick"> & {
  href: string;
};

export function TextLink({ href, ...props }: TextLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      render={(attributes) => (
        <NextLink {...(attributes as AnchorAttributes)} href={href} />
      )}
    />
  );
}
