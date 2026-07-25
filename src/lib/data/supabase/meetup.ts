import "server-only";

import type { Id, Meetup, MeetupAttendance } from "@/lib/types";

import { toMeetup, toMeetupAttendance } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * Meetup·MeetupAttendance 읽기 전용 실데이터 구현 (Task 031, FR-060~061·063~064·068).
 * Mock(`../mock/meetup.ts`)과 동일한 시그니처(NFR-035). 쓰기(`createMeetupFromPoll`·
 * `respondAttendance`, FR-066·067 정원 원자성)는 Task 032 몫 — 배럴이 `../mock/meetup`에서
 * 그대로 재노출한다. **정원 조건부 UPDATE(D-019)는 이 파일이 다루지 않는다.**
 */

export async function getMeetupById(id: Id): Promise<Meetup | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("meetups").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toMeetup(data) : null;
}

export async function getMeetupByPollId(pollId: Id): Promise<Meetup | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetups")
    .select("*")
    .eq("poll_id", pollId)
    .maybeSingle();
  if (error) throw error;
  return data ? toMeetup(data) : null;
}

export interface ListMeetupsQuery {
  crewIds: Id[];
  from: string;
  to: string;
  includeCancelled?: boolean;
}

/** 캘린더 월간 뷰 + 크루 필터(FR-061). 기본은 취소된 Meetup을 제외한다. */
export async function listMeetupsByCrews(opts: ListMeetupsQuery): Promise<Meetup[]> {
  if (opts.crewIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("meetups")
    .select("*")
    .in("crew_id", opts.crewIds)
    .gte("date", opts.from)
    .lte("date", opts.to);
  if (!opts.includeCancelled) query = query.eq("status", "confirmed");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toMeetup);
}

/** 참석자 목록 조회(FR-068). */
export async function listAttendance(meetupId: Id): Promise<MeetupAttendance[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("meetup_attendances")
    .select("*")
    .eq("meetup_id", meetupId);
  if (error) throw error;
  return (data ?? []).map(toMeetupAttendance);
}
