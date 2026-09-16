// src/components/SmartLink.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const GUEST_ONLY = ["/", "/login"];

export default function SmartLink({ to, onClick, children, ...rest }) {
  const { isLoggedIn, profile } = useAuth();

  // Only rewrite to /home for someone who is FULLY logged in — a valid
  // token isn't enough; onboarding must be done too. Otherwise an
  // unfinished signup clicking the logo or Sign In gets silently
  // redirected to /home instead of / or /login, which then bounces them
  // straight back via OnboardingGate — making both links look dead.
  const fullyLoggedIn = isLoggedIn && profile?.onboarding_step === "done";
  const target = fullyLoggedIn && GUEST_ONLY.includes(to) ? "/home" : to;

  return (
    <Link to={target} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}