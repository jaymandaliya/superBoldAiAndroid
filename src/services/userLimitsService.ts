import { LEARNING_URL, USER_API_URL } from '../constants';
import { Learning } from '../types';

export async function fetchFreeTimeStatus(authToken: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${USER_API_URL}/free-time`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.ok) {
      return (await response.json()) as Record<string, unknown>;
    }
  } catch {
    /* caller logs */
  }
  return null;
}

export async function postFreeTimeUsage(
  authToken: string,
  secondsUsed: number
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${USER_API_URL}/free-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ seconds_used: secondsUsed }),
    });

    if (response.ok) {
      return (await response.json()) as Record<string, unknown>;
    }
  } catch {
    /* caller logs */
  }
  return null;
}

export async function postLevelTime(
  authToken: string,
  body: {
    level: number;
    duration_seconds: number;
    native_language: string;
    target_language: string;
  }
): Promise<boolean> {
  try {
    const response = await fetch(`${LEARNING_URL}/level-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLevelStats(
  authToken: string,
  learning: Pick<Learning, 'native_language' | 'target_language'>
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      `${LEARNING_URL}/level-stats?native_language=${learning.native_language}&target_language=${learning.target_language}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    if (response.ok) {
      return (await response.json()) as Record<string, unknown>;
    }
  } catch {
    /* caller logs */
  }
  return null;
}
