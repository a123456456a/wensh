import axios from "axios";
const client = axios.create({ baseURL: "/api" });
/**
 * 提交自然语言查询
 */
export async function postQuery(body) {
    const { data } = await client.post("/query", body);
    return data;
}
/**
 * 获取服务健康状态
 */
export async function getHealth() {
    const { data } = await client.get("/health");
    return data;
}
