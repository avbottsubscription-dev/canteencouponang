import { Injectable } from '@angular/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Employee } from '../models/user.model';
import { Coupon } from '../models/coupon.model';

// 🔑 Direct API key इथे टाकले आहे
const API_KEY = 'AIzaSyBvVe88vBDaX0rOop25zpn1v5Dqco4DWK4';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    // Google Generative AI client initialize
    this.genAI = new GoogleGenerativeAI(API_KEY);
  }

  async generateInsights(
    question: string,
    employees: Employee[],
    coupons: Coupon[]
  ): Promise<string> {
    // Employees simplify
    const simplifiedEmployees = employees.map(emp => ({
      id: emp.id,
      role: emp.role,
      department: emp.department || 'N/A',
      contractor: emp.contractor || 'N/A',
    }));

    // Coupons simplify
    const simplifiedCoupons = coupons.map(c => ({
      employeeId: c.employeeId,
      couponType: c.couponType,
      status: c.status,
      dateIssued: c.dateIssued?.split('T')[0] || null,
      redeemDate: c.redeemDate ? c.redeemDate.split('T')[0] : null,
    }));

    const dataForAI = {
      employees: simplifiedEmployees,
      coupons: simplifiedCoupons,
    };

    const prompt = `
You are an AI assistant for a Canteen Management System.

Analyze the JSON data and answer clearly about coupon usage, patterns, or any insights.
Use bullet points where helpful.
Today's date: ${new Date().toISOString().split('T')[0]}

JSON Data:
${JSON.stringify(dataForAI)}

User Question:
"${question}"
`;

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-pro',
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;

      return response.text();
    } catch (error) {
      console.error('Gemini API Error:', error);
      return '⚠️ Gemini service is temporarily unavailable. Please try again later.';
    }
  }
}
