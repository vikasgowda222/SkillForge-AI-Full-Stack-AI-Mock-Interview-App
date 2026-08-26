import React from "react";
import { CopyrightIcon, Github, Linkedin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white py-6">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
        {/* Copyright Section */}
        <div className="flex items-center text-sm">
          <CopyrightIcon className="mr-2 h-5 w-5 text-gray-400" />
          <span>
            {new Date().getFullYear()} SkillForge AI. All Rights Reserved.
          </span>
        </div>

        {/* Social Media Links */}
        <div className="flex space-x-4">
          <a
            href="https://github.com/vikasgowda222"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-500 transition-colors"
            aria-label="GitHub"
          >
            <Github className="h-6 w-6" />
          </a>
          <a
            href="https://www.linkedin.com/in/vikas-gowda-s-857591248"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-500 transition-colors"
            aria-label="LinkedIn"
          >
            <Linkedin className="h-6 w-6" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
