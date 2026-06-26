import { useContext } from 'react';
import { AuthContext } from './authContextObject.js';

export const useAuth = () => {
    const context = useContext( AuthContext );

    if ( !context ) {
        throw new Error( 'useAuth deve ser obrigatoriamente utilizado dentro de um AuthProvider.' );
    }

    return context;
};

export default useAuth;
