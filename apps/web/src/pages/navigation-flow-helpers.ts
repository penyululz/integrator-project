export function getReturnPath(input: {
  returnTo?: string | null;
  templateId?: string | null;
}): string {
  if (input.returnTo && input.returnTo.startsWith("/")) {
    return input.returnTo;
  }
  if (input.templateId) {
    return `/workflows?templateId=${encodeURIComponent(input.templateId)}`;
  }
  return "/workflows";
}

export function redirectAfterConnection(input: {
  templateId?: string | null;
  returnTo?: string | null;
  fallback?: string;
}): string {
  const fallback = input.fallback || "/first-automation";
  const returnPath = getReturnPath({
    returnTo: input.returnTo,
    templateId: input.templateId,
  });

  if (returnPath && returnPath !== "/workflows") {
    return returnPath;
  }
  return fallback;
}
