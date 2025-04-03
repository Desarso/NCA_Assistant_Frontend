import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { signOut, auth } from "@/lib/firebase";
import { useNavigate } from "@solidjs/router";
import { LogOut, Settings, User } from "lucide-solid";
import { createEffect } from "solid-js";

interface AvatarDropdownProps {
    class?: string;
}

function AvatarDropdown(props: AvatarDropdownProps) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Failed to log out:', error);
        }
    };

    createEffect(() => {
        console.log(currentUser());
    });

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase();
    };

    return ( 
        <DropdownMenu>
            <DropdownMenuTrigger class={`w-[80%] border-2 border-border ring-1 ring-border/50 rounded-full ${props.class}`}>
                <div class="flex items-center justify-between w-[full] px-3 py-1.5">
                    <div class="flex items-center gap-2">
                        <Avatar>
                            <AvatarImage src={currentUser()?.photoURL || undefined} />
                            <AvatarFallback>
                                {currentUser()?.displayName ? getInitials(currentUser()?.displayName || '') : 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <span class="text-sm font-medium">
                            {currentUser()?.displayName || 'User'}
                            <span class="text-[10px] text-muted-foreground block">@{currentUser()?.email?.split('@')[0] || 'user'}</span>
                        </span>
                    </div>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem class="cursor-pointer" onClick={() => navigate('/profile')}>
                    <User class="mr-2 h-4 w-4" />
                    Profile
                </DropdownMenuItem>
                <DropdownMenuItem class="cursor-pointer" onClick={() => navigate('/settings')}>
                    <Settings class="mr-2 h-4 w-4" />
                    Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut class="mr-2 h-4 w-4" />
                    Logout
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
     );
}

export default AvatarDropdown;