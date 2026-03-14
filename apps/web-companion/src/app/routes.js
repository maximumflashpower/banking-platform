import ChatPage from "../pages/ChatPage.jsx";
import PersonalPage from "../pages/PersonalPage.jsx";
import BusinessPage from "../pages/BusinessPage.jsx";
import FinancialInboxPage from "../pages/FinancialInboxPage.jsx";
import ApprovalsPage from "../pages/ApprovalsPage.jsx";
import LoginQrPage from "../pages/LoginQrPage.jsx";

export function resolveRoute(pathname, authenticated) {
  if (!authenticated) return LoginQrPage;

  switch (pathname) {
    case "/chat":
      return ChatPage;
    case "/personal":
      return PersonalPage;
    case "/business":
      return BusinessPage;
    case "/financial-inbox":
      return FinancialInboxPage;
    case "/approvals":
      return ApprovalsPage;
    case "/":
    default:
      return PersonalPage;
  }
}