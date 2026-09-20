"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";

const eventSchema = z.object({
  title: z.string().min(1, "Event title is required"),
  description: z.string().min(10, "Description must be at least 10 characters long"),
  date: z.string().min(1, "Please enter an event date"),
  time: z.string().min(1, "Please enter an event time"),
  location: z.string().min(1, "Location is required"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  category: z.string().min(1, "Please select a category"),
  registrationInfo: z.string().optional()
});

type EventFormValues = z.infer<typeof eventSchema>;

export default function CreateEventPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      price: 0
    }
  });

  const onSubmit = async (data: EventFormValues) => {
    setIsSubmitting(true);
    setErrorMsg("");
    setSuccess(false);

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        throw new Error("Failed to create event. Please try again.");
      }

      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create New Event</h1>
        <p className="text-gray-500">List a new event for other participants to discover.</p>
      </div>

      <div className="bg-white border rounded-2xl p-8 shadow-sm">
        {success && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 font-medium">
            Event created successfully! <Link href="/discover" className="underline font-bold">View in feed</Link>
          </div>
        )}
        
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Event Title</label>
            <input 
              {...register("title")} 
              className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g. Acoustic Sessions at the Quad"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1 font-medium">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
            <textarea 
              {...register("description")} 
              rows={4}
              className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="Enter descriptive text about your schedule, activities, guidelines..."
            />
            {errors.description && <p className="text-red-500 text-xs mt-1 font-medium">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
              <input 
                type="date"
                {...register("date")} 
                className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black ${errors.date ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.date && <p className="text-red-500 text-xs mt-1 font-medium">{errors.date.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Time</label>
              <input 
                type="time"
                {...register("time")} 
                className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black ${errors.time ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.time && <p className="text-red-500 text-xs mt-1 font-medium">{errors.time.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Location / Venue</label>
            <input 
              {...register("location")} 
              className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black ${errors.location ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g. Room 402, Campus Arts Hall"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1 font-medium">{errors.location.message}</p>}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
              <select 
                {...register("category")} 
                className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black bg-white ${errors.category ? 'border-red-500' : 'border-gray-300'}`}
              >
                <option value="">Select a category</option>
                <option value="Night Markets">Night Markets</option>
                <option value="School Events">School Events</option>
                <option value="Concerts">Concerts</option>
                <option value="Workshops">Workshops</option>
              </select>
              {errors.category && <p className="text-red-500 text-xs mt-1 font-medium">{errors.category.message}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Price (₱)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="number"
                  step="0.01"
                  {...register("price")} 
                  className={`w-full border rounded-lg px-4 py-3 focus:ring-black focus:border-black ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
                  placeholder="0.00"
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">0.00 is a free event</span>
              </div>
              {errors.price && <p className="text-red-500 text-xs mt-1 font-medium">{errors.price.message}</p>}
            </div>
          </div>

          <div className="pt-6 border-t mt-8 flex justify-end gap-4">
            <button type="button" className="px-6 py-3 border font-medium rounded-xl hover:bg-gray-50">
              Save Draft
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-8 py-3 bg-[#121212] text-white font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50"
            >
              {isSubmitting ? "Publishing..." : "Publish Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
