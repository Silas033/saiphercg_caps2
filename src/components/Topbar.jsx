import { FaChevronDown } from "react-icons/fa";

import "../styles/topbar.css";

export default function Topbar() {

    return (

        <header className="dss-topbar">
            <div className="topbar-actions">
                <div className="user-profile">

                    <span className="user-avatar">
                        CG
                    </span>

                    <span>
                        Client User
                    </span>

                    <FaChevronDown />

                </div>

            </div>

        </header>

    );

}
