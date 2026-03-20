import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig } from 'axios';
import { map } from 'rxjs';
import lodash from 'lodash';

// This Injectable http service wrapper will convert the response from snake_case to camelCase
// and convert the request from camelCase to snake_case
@Injectable()
export class MockbankHttpService {
  private readonly baseUrl = 'http://localhost:8787'; // external service port;

  constructor(private readonly httpService: HttpService) {}

  private toSnakeCase(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.toSnakeCase(item));
    return lodash.mapKeys(obj, (_, key) => lodash.snakeCase(key));
  }

  private toCamelCase(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.toCamelCase(item));
    return lodash.mapKeys(obj, (_, key) => lodash.camelCase(key));
  }

  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.httpService
      .get<T>(`${this.baseUrl}${url}`, config)
      .pipe(map((res) => this.toCamelCase(res.data)));
  }

  post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const snakeData = this.toSnakeCase(data);
    return this.httpService
      .post<T>(`${this.baseUrl}${url}`, snakeData, config)
      .pipe(map((res) => this.toCamelCase(res.data)));
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.httpService
      .delete<T>(`${this.baseUrl}${url}`, config)
      .pipe(map((res) => this.toCamelCase(res.data)));
  }

  put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const snakeData = this.toSnakeCase(data);
    return this.httpService
      .put<T>(`${this.baseUrl}${url}`, snakeData, config)
      .pipe(map((res) => this.toCamelCase(res.data)));
  }

  patch<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const snakeData = this.toSnakeCase(data);
    return this.httpService
      .patch<T>(`${this.baseUrl}${url}`, snakeData, config)
      .pipe(map((res) => this.toCamelCase(res.data)));
  }
}
