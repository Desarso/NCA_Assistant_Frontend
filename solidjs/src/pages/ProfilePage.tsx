import { Component, createSignal, onMount, Show } from 'solid-js';
import { auth } from '../lib/firebase';
import { User, updateProfile, signOut } from 'firebase/auth';
import { Camera, LogOut } from 'lucide-solid';

const HOST = import.meta.env.VITE_CHAT_HOST;

const ProfilePage: Component = () => {
    const [user, setUser] = createSignal<User | null>(null);
    const [isHovered, setIsHovered] = createSignal(false);
    const [isUploading, setIsUploading] = createSignal(false);

    onMount(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setUser(user);
        });

        return () => unsubscribe();
    });

    const getInitials = (name: string | null) => {
        if (!name) return '?';
        return name
            .split(' ')
            .filter(Boolean)
            .map(word => word[0].toUpperCase())
            .join('')
            .slice(0, 2);
    };

    const handlePhotoUpload = async (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || !user()) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('File is too large. Please upload an image smaller than 5MB.');
            return;
        }

        input.value = '';
        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const idToken = await user()?.getIdToken();

            const response = await fetch(`${HOST}/api/v1/users/profile/picture`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to upload photo');
            }

            const data = await response.json();
            await updateProfile(auth.currentUser!, { photoURL: data.photo_url });
            setUser(auth.currentUser);

        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Failed to upload photo. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
            alert('Failed to sign out. Please try again.');
        }
    };

    return (
        <Show
            when={user()}
            fallback={<div class="flex items-center justify-center min-h-screen dark:bg-gray-900">Loading...</div>}
        >
            <div class="max-w-3xl mx-auto p-8">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                    <div class="text-center mb-8">
                        <div
                            class={`relative w-40 h-40 mx-auto mb-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 transition-transform duration-300 ${
                                isHovered() ? 'scale-110' : ''
                            }`}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                        >
                            <Show
                                when={user()?.photoURL}
                                fallback={
                                    <div class="w-full h-full flex items-center justify-center text-4xl font-semibold text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-700">
                                        {getInitials(user()?.displayName ?? null)}
                                    </div>
                                }
                            >
                                <img
                                    src={user()?.photoURL ?? undefined}
                                    alt="Profile"
                                    class="w-full h-full object-cover"
                                />
                            </Show>
                            <label class={`absolute bottom-0 left-0 right-0 bg-black/70 text-white p-3 cursor-pointer flex items-center justify-center transition-transform duration-300 ${
                                isHovered() ? 'translate-y-0' : 'translate-y-full'
                            }`}>
                                <Camera size={24} />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handlePhotoUpload}
                                    class="hidden"
                                    disabled={isUploading()}
                                />
                            </label>
                        </div>
                        <h1 class="text-3xl font-bold text-gray-800 dark:text-white mb-2">
                            {user()?.displayName || 'User'}
                        </h1>
                        <p class="text-gray-600 dark:text-gray-300">{user()?.email}</p>
                    </div>

                    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
                        <div class="mb-6">
                            <h2 class="text-xl font-semibold text-gray-800 dark:text-white mb-4">Account Information</h2>
                            <div class="space-y-4">
                                <div class="flex border-b border-gray-200 dark:border-gray-600 pb-4">
                                    {/* <span class="font-medium text-gray-600 dark:text-gray-300 w-40">Email:</span>
                                    <span class="text-gray-800 dark:text-white">{user()?.email}</span> */}
                                </div>
                                <div class="flex border-b border-gray-200 dark:border-gray-600 pb-4">
                                    <span class="font-medium text-gray-600 dark:text-gray-300 w-40">Account Created:</span>
                                    <span class="text-gray-800 dark:text-white">
                                        {user()?.metadata.creationTime ? new Date(user()?.metadata.creationTime!).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                                <div class="flex pb-4">
                                    <span class="font-medium text-gray-600 dark:text-gray-300 w-40">Last Sign In:</span>
                                    <span class="text-gray-800 dark:text-white">
                                        {user()?.metadata.lastSignInTime ? new Date(user()?.metadata.lastSignInTime!).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleLogout}
                        class="mt-8 flex items-center gap-2 px-6 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 active:scale-95"
                    >
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </div>
        </Show>
    );
};

export default ProfilePage;
