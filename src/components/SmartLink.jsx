import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const GUEST_ONLY = ["/", "/login", "/terms"];

export default function SmartLink({ to, onClick, children, ...rest }) {
  const { effectiveLoggedIn } = useAuth();
  const target = effectiveLoggedIn && GUEST_ONLY.includes(to) ? "/home" : to;

  return (
    <Link to={target} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}