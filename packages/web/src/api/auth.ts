import axios from "axios";
import type { LoginRequest, LoginResponse, LogoutResponse, MeResponse } from "@wensh/shared";

const client = axios.create({
  baseURL: "/api/auth",
  withCredentials: true,
});

/**
 * 用户登录
 * @param body - 用户名与密码
 */
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>("/login", body);
  return data;
}

/** 退出登录 */
export async function logout(): Promise<LogoutResponse> {
  const { data } = await client.post<LogoutResponse>("/logout");
  return data;
}

/** 获取当前登录用户；未登录返回 null */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const { data } = await client.get<MeResponse>("/me");
    return data;
  } catch {
    return null;
  }
}
