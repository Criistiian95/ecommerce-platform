import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };

// React Router preserves native new-tab, modifier-click and external-link behavior.
export default forwardRef<HTMLAnchorElement, Props>(function StaticLink({ href, ...props }, ref) {
  return <Link ref={ref} to={href} {...props} />;
});
