'use client';
import Link from 'next/link';
import { ComponentProps } from 'react';
import { useStorefront } from './storefront-context';
export default function StoreLink(props: ComponentProps<typeof Link>) {
  const { path } = useStorefront();
  return <Link {...props} href={typeof props.href === 'string' ? path(props.href) : props.href} />;
}
