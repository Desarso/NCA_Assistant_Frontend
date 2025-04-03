import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { signOut, auth } from "@/lib/firebase";
import { useNavigate } from "@solidjs/router";
import { LogOut, Settings, User } from "lucide-solid";
import { createEffect } from "solid-js";

function AvatarDropdown() {
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
            <DropdownMenuTrigger class="border-2 border-border ring-1 ring-border/50 rounded-full">
                <Avatar>
                    <AvatarImage src={currentUser()?.photoURL || undefined} />
                    <AvatarFallback>
                        {currentUser()?.displayName ? getInitials(currentUser().displayName) : 'U'}
                    </AvatarFallback>
                </Avatar>
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