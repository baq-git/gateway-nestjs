import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { catchError, map, throwError } from 'rxjs';
import lodash from 'lodash';

// This Injectable http service wrapper will convert the response from snake_case to camelCase
// and convert the request from camelCase to snake_case
@Injectable()
export class MockBankHttpService {
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

  private handleError(error: AxiosError) {
    if (error.response?.data) {
      error.response.data = this.toCamelCase(error.response.data);
    }

    return throwError(() => error);
  }

  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.httpService.get<T>(`${this.baseUrl}${url}`, config).pipe(
      map((res) => this.toCamelCase(res.data)),
      catchError((error: AxiosError) => this.handleError(error)),
    );
  }

  post<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const snakeData = this.toSnakeCase(data);
    return this.httpService
      .post<T>(`${this.baseUrl}${url}`, snakeData, config)
      .pipe(
        map((res) => this.toCamelCase(res.data)),
        catchError((error: AxiosError) => {
          return this.handleError(error);
        }),
      );
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.httpService.delete<T>(`${this.baseUrl}${url}`, config).pipe(
      map((res) => this.toCamelCase(res.data)),
      catchError((error: AxiosError) => this.handleError(error)),
    );
  }

  put<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const snakeData = this.toSnakeCase(data);
    return this.httpService
      .put<T>(`${this.baseUrl}${url}`, snakeData, config)
      .pipe(
        map((res) => this.toCamelCase(res.data)),
        catchError((error: AxiosError) => this.handleError(error)),
      );
  }

  patch<T>(url: string, data?: any, config?: AxiosRequestConfig) {
    const snakeData = this.toSnakeCase(data);
    return this.httpService
      .patch<T>(`${this.baseUrl}${url}`, snakeData, config)
      .pipe(
        map((res) => this.toCamelCase(res.data)),
        catchError((error: AxiosError) => this.handleError(error)),
      );
  }
}
