// components/shipping/DeliverToBar.jsx
// Delivery-address bar for the top of the Home page. Only for signed-in buyers.
import AddressBook from "./AddressBook.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function DeliverToBar() {
    const { token, effectiveLoggedIn } = useAuth();
    if (!effectiveLoggedIn || !token) return null;
    return <AddressBook variant="compact" />;
}