export async function runProtectedAction(action, { onStepUpRequired } = {}) {
  try {
    return await action();
  } catch (err) {
    if (err?.body?.error === 'step_up_required') {
      onStepUpRequired?.(err);
    }
    throw err;
  }
}