import Axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";

const axios = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
});

const authRequestInterceptor = (
  config: AxiosRequestConfig
): AxiosRequestConfig => {
  config.headers = config.headers || {};
  config.headers.Accept = "application/json";
  return config;
};

const requestErrorHandler = (error: AxiosError): Promise<AxiosError> => {
  console.error("[API Request Error]", error);
  return Promise.reject(error);
};

const responseSuccessHandler = <T>(
  response: AxiosResponse<T>
): AxiosResponse<T> => {
  return response;
};

const responseErrorHandler = <T>(
  error: AxiosError<T>
): Promise<AxiosError<T>> => {
  console.error("[API Response Error]", error.response?.data);
  return Promise.reject(error);
};

// Add interceptors
// @ts-ignore
axios.interceptors.request.use(authRequestInterceptor, requestErrorHandler);
axios.interceptors.response.use(responseSuccessHandler, responseErrorHandler);

export default axios;
